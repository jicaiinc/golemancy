interface PixelToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  'data-testid'?: string
}

export function PixelToggle({ checked, onChange, disabled, label, 'data-testid': testId }: PixelToggleProps) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        data-testid={testId}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-10 h-5 border-2 transition-colors rounded-full ${
          checked
            ? 'bg-accent-green/20 border-accent-green'
            : 'bg-deep border-border-dim'
        } shadow-sunken`}
      >
        <span
          className={`absolute top-[1px] w-3.5 h-3.5 transition-[left] rounded-full ${
            checked
              ? 'left-[20px] bg-accent-green'
              : 'left-[1px] bg-text-secondary'
          }`}
        />
      </button>
      {label && <span className="font-mono text-[12px] text-text-primary">{label}</span>}
    </label>
  )
}
