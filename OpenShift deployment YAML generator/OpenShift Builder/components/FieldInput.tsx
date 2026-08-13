import type { Field } from "../fields";

const inputBase =
  "w-full bg-white/[0.03] border border-white/10 rounded-lg px-3.5 py-2.5 text-[15px] text-[var(--ink)] " +
  "placeholder:text-white/25 font-mono transition-colors focus:border-[var(--violet)] focus:bg-white/[0.05] " +
  "hover:border-white/20";

function randomToken(len = 128) {
  const chars = "abcdef0123456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % 16]).join("");
}

export default function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  const missing = field.required && (value === "" || value == null);

  if (field.type === "toggle") {
    return (
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            value ? "bg-[var(--violet)]" : "bg-white/12"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              value ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-sm text-white/70">{value ? "Enabled" : "Disabled"}</span>
      </label>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[13px] font-medium tracking-wide text-white/65 uppercase">
          {field.label}
          {field.required && <span className="text-[var(--violet-bright)]"> *</span>}
        </label>
        {field.secret && (
          <button
            type="button"
            onClick={() => onChange(randomToken())}
            className="text-[11px] font-mono uppercase tracking-wider text-[var(--violet-bright)] hover:text-white transition-colors"
          >
            Generate
          </button>
        )}
      </div>

      {field.type === "select" ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputBase + " appearance-none cursor-pointer"}
        >
          {field.options!.map((o) => (
            <option key={o} value={o} className="bg-[#12111a]">
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
          value={value ?? ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputBase} ${missing ? "border-rose-500/40" : ""} ${
            field.secret ? "truncate" : ""
          }`}
        />
      )}
      {field.help && <p className="mt-1.5 text-[12px] leading-snug text-white/35">{field.help}</p>}
    </div>
  );
}
