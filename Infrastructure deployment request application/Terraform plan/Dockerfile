FROM 3b/base
LABEL io.3b.exec.adapter.v1='["/usr/bin/env","LD_LIBRARY_PATH=./python/lib","PYTHONPATH=./site-packages","./python/bin/python3","-S","/opt/3b/adapters/python.py"]'

RUN \
  --mount=type=cache,target=uv \
  --mount=type=cache,target=uvx \
  curl --proto '=https' --tlsv1.2 -fsSL "https://github.com/astral-sh/uv/releases/download/0.6.14/uv-$(uname -m)-unknown-linux-gnu.tar.gz" \
    | tar -xzf - --strip-components=1 && \
  chmod +x ./uv ./uvx

RUN \
  --mount=type=cache,target=python \
  curl --proto '=https' --tlsv1.2 -fsSL "https://github.com/astral-sh/python-build-standalone/releases/download/20250409/cpython-3.13.3+20250409-$(uname -m)-unknown-linux-gnu-install_only_stripped.tar.gz" \
    | tar -xzf -

RUN \
  --mount=type=cache,target=tfcli \
  case $(uname -m) in x86_64) TFARCH=amd64;; *) TFARCH=arm64;; esac && \
  curl --proto '=https' --tlsv1.2 -fsSL -o /tmp/tf.zip \
    "https://releases.hashicorp.com/terraform/1.9.8/terraform_1.9.8_linux_${TFARCH}.zip" && \
  unzip -qo /tmp/tf.zip -d ./tfcli && \
  chmod +x ./tfcli/terraform && \
  rm /tmp/tf.zip && \
  ./tfcli/terraform version

COPY requirements.txt .
RUN \
  --mount=type=cache,target=site-packages \
  if [ -f requirements.txt ]; then \
    LD_LIBRARY_PATH=./python/lib UV_NATIVE_TLS=true \
    ./uv pip install --python ./python/bin/python3 --target site-packages -r requirements.txt; \
  fi

COPY . .

VOLUME ["infra:concurrency=exclusive"]

CMD LD_LIBRARY_PATH=./python/lib PYTHONPATH=./site-packages \
    ./python/bin/python3 -S script.py
