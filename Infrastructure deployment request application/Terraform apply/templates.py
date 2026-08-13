"""Terraform HCL templates for each catalog resource type.

Each builder returns (main_tf, tfvars) where main_tf is the HCL for main.tf and
tfvars is a dict written to terraform.tfvars.json. Params come from the request
record and were already validated by the Requests API against the catalog.
"""
from typing import Any, Dict, Tuple

_HEADER = '''terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }%s
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type = string
}
'''

_RANDOM_PROVIDER = '''
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }'''


def _ec2(params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    tf = (_HEADER % "") + '''
variable "name" { type = string }
variable "instance_type" { type = string }

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_instance" "this" {
  ami           = data.aws_ami.al2023.id
  instance_type = var.instance_type
  tags = {
    Name      = var.name
    ManagedBy = "3b-infra-portal"
  }
}

output "instance_id" { value = aws_instance.this.id }
output "public_ip"   { value = aws_instance.this.public_ip }
output "private_ip"  { value = aws_instance.this.private_ip }
'''
    vars = {
        "region": params["region"],
        "name": params["name"],
        "instance_type": params["instance_type"],
    }
    return tf, vars


def _s3(params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    tf = (_HEADER % "") + '''
variable "bucket_name" { type = string }
variable "versioning"  { type = bool }

resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name
  tags = {
    ManagedBy = "3b-infra-portal"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = var.versioning ? "Enabled" : "Suspended"
  }
}

output "bucket_name" { value = aws_s3_bucket.this.id }
output "bucket_arn"  { value = aws_s3_bucket.this.arn }
'''
    vars = {
        "region": params["region"],
        "bucket_name": params["bucket_name"],
        "versioning": bool(params.get("versioning", False)),
    }
    return tf, vars


def _rds(params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    tf = (_HEADER % _RANDOM_PROVIDER) + '''
variable "identifier"        { type = string }
variable "instance_class"    { type = string }
variable "allocated_storage" { type = number }
variable "db_name"           { type = string }
variable "username"          { type = string }

resource "random_password" "master" {
  length           = 20
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_instance" "this" {
  identifier              = var.identifier
  engine                  = "postgres"
  instance_class          = var.instance_class
  allocated_storage       = var.allocated_storage
  db_name                 = var.db_name
  username                = var.username
  password                = random_password.master.result
  skip_final_snapshot     = true
  publicly_accessible     = false
  backup_retention_period = 1
  tags = {
    ManagedBy = "3b-infra-portal"
  }
}

output "endpoint" { value = aws_db_instance.this.endpoint }
output "db_name"  { value = aws_db_instance.this.db_name }
output "username" { value = aws_db_instance.this.username }
output "password" {
  value     = random_password.master.result
  sensitive = true
}
'''
    vars = {
        "region": params["region"],
        "identifier": params["identifier"],
        "instance_class": params["instance_class"],
        "allocated_storage": int(params["allocated_storage"]),
        "db_name": params["db_name"],
        "username": params["username"],
    }
    return tf, vars


_BUILDERS = {
    "ec2_instance": _ec2,
    "s3_bucket": _s3,
    "rds_postgres": _rds,
}


def build(type_id: str, params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    if type_id not in _BUILDERS:
        raise ValueError(f"No Terraform template for type: {type_id}")
    return _BUILDERS[type_id](params)
