import * as React from "react"

interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}

const switchStyles = `
  .neo-switch-container {
    display: flex;
    align-items: center;
    justify-content: center;
    --hue: 220deg;
    --width: 3rem;
    --accent-hue: 22deg;
    --duration: 0.6s;
    --easing: cubic-bezier(1, 0, 1, 1);
  }

  .neo-switch-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .neo-switch-label {
    --shadow-offset: calc(var(--width) / 20);
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    width: var(--width);
    height: calc(var(--width) / 2.5);
    border-radius: var(--width);
    box-shadow: inset 4px 4px 6px hsl(var(--hue) 20% 80%),
      inset -4px -4px 6px hsl(var(--hue) 20% 93%);
  }

  .neo-switch-label:focus-within {
    outline: 2px solid hsl(var(--accent-hue) 70% 50%);
    outline-offset: 2px;
  }

  .neo-switch-indicator {
    position: absolute;
    width: 40%;
    height: 60%;
    transition: all var(--duration) var(--easing);
    box-shadow: inset 0 0 1px hsl(var(--hue) 20% 15% / 60%),
      inset 0 0 2px 1px hsl(var(--hue) 20% 15% / 60%),
      inset 0 0 3px 1px hsl(var(--hue) 20% 45% / 60%);
  }

  .neo-switch-indicator-left {
    --hue: var(--accent-hue);
    overflow: hidden;
    left: 10%;
    border-radius: 100px 0 0 100px;
    background: linear-gradient(180deg, hsl(calc(var(--accent-hue) + 20deg) 95% 80%) 10%, hsl(calc(var(--accent-hue) + 20deg) 100% 60%) 30%, hsl(var(--accent-hue) 90% 50%) 60%, hsl(var(--accent-hue) 90% 60%) 75%, hsl(var(--accent-hue) 90% 50%));
  }

  .neo-switch-indicator-right {
    right: 10%;
    border-radius: 0 100px 100px 0;
    background-image: linear-gradient(180deg, hsl(var(--hue) 20% 95%), hsl(var(--hue) 20% 65%) 60%, hsl(var(--hue) 20% 70%) 70%, hsl(var(--hue) 20% 65%));
  }

  .neo-switch-button {
    position: absolute;
    z-index: 1;
    width: 55%;
    height: 80%;
    left: 5%;
    border-radius: 100px;
    background-image: linear-gradient(160deg, hsl(var(--hue) 20% 95%) 40%, hsl(var(--hue) 20% 65%) 70%);
    transition: all var(--duration) var(--easing);
    box-shadow: 1px 1px 2px hsl(var(--hue) 18% 50% / 80%),
      1px 1px 4px hsl(var(--hue) 18% 50% / 40%),
      4px 8px 6px hsl(var(--hue) 18% 50% / 40%),
      8px 12px 16px hsl(var(--hue) 18% 50% / 60%);
  }

  .neo-switch-button::before, 
  .neo-switch-button::after {
    content: '';
    position: absolute;
    top: 10%;
    width: 41%;
    height: 80%;
    border-radius: 100%;
  }

  .neo-switch-button::before {
    left: 5%;
    box-shadow: inset 1px 1px 1px hsl(var(--hue) 20% 85%);
    background-image: linear-gradient(-50deg, hsl(var(--hue) 20% 95%) 20%, hsl(var(--hue) 20% 85%) 80%);
  }

  .neo-switch-button::after {
    right: 5%;
    box-shadow: inset 1px 1px 2px hsl(var(--hue) 20% 70%);
    background-image: linear-gradient(-50deg, hsl(var(--hue) 20% 95%) 20%, hsl(var(--hue) 20% 75%) 80%);
  }

  .neo-switch-input:checked ~ .neo-switch-button {
    left: 40%;
  }

  .neo-switch-input:not(:checked) ~ .neo-switch-indicator-left,
  .neo-switch-input:checked ~ .neo-switch-indicator-right {
    box-shadow: inset 0 0 3px hsl(var(--hue) 20% 15% / 100%),
      inset 10px 10px 6px hsl(var(--hue) 20% 15% / 100%),
      inset 10px 10px 8px hsl(var(--hue) 20% 45% / 100%);
  }

  .neo-switch-label.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

let stylesInjected = false

function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  const styleElement = document.createElement('style')
  styleElement.setAttribute('data-neo-switch', 'true')
  styleElement.textContent = switchStyles
  document.head.appendChild(styleElement)
  stylesInjected = true
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ checked, defaultChecked, onCheckedChange, disabled, className, id, name }, ref) => {
    const isControlled = checked !== undefined
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false)
    
    const currentChecked = isControlled ? checked : internalChecked

    React.useEffect(() => {
      injectStyles()
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return
      const newChecked = e.target.checked
      
      if (!isControlled) {
        setInternalChecked(newChecked)
      }
      
      onCheckedChange?.(newChecked)
    }

    return (
      <div 
        className={`neo-switch-wrapper ${disabled ? 'opacity-50' : ''} ${className || ''}`}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        <div className="neo-switch-container">
          <label className={`neo-switch-label ${disabled ? 'disabled' : ''}`}>
            <input
              ref={ref}
              className="neo-switch-input"
              type="checkbox"
              checked={currentChecked}
              onChange={handleChange}
              disabled={disabled}
              id={id}
              name={name}
              role="switch"
              aria-checked={currentChecked}
            />
            <div className="neo-switch-indicator neo-switch-indicator-left" />
            <div className="neo-switch-indicator neo-switch-indicator-right" />
            <div className="neo-switch-button" />
          </label>
        </div>
      </div>
    )
  }
)

Switch.displayName = "Switch"

export { Switch }
