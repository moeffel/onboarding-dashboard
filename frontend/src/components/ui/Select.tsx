import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            'block w-full px-3 py-2.5 border rounded-md shadow-sm transition-colors bg-white text-slate-900',
            'focus:outline-none focus:ring-2 focus:ring-sl-red focus:border-sl-red',
            error
              ? 'border-sl-red/40 text-sl-red'
              : 'border-slate-300/80',
            className
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-sm text-sl-red">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export default Select
