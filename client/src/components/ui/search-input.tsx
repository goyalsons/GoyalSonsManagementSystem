import * as React from "react"

interface SearchInputProps {
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onSearch?: (value: string) => void
  className?: string
  id?: string
  name?: string
  showButton?: boolean
  buttonText?: string
}

const searchInputStyles = `
  .gradient-search-container {
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    padding: 0 4px;
    width: 100%;
  }

  .gradient-search-input {
    flex: 1;
    height: 32px;
    border: none;
    outline: none;
    caret-color: var(--primary);
    background-color: transparent;
    border-radius: 8px;
    padding-left: 12px;
    padding-right: 10px;
    letter-spacing: 0.4px;
    color: var(--foreground);
    font-size: 14px;
    width: 100%;
  }

  .gradient-search-input::placeholder {
    color: var(--muted-foreground);
    opacity: 0.7;
  }

  .gradient-search-button {
    height: 32px;
    padding: 0 12px;
    margin-left: 4px;
    border: none;
    border-radius: 8px;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .gradient-search-button:hover {
    opacity: 0.9;
  }

  .gradient-search-button:active {
    transform: scale(0.98);
  }
`

let searchStylesInjected = false

function injectSearchStyles() {
  if (searchStylesInjected || typeof document === 'undefined') return
  const styleElement = document.createElement('style')
  styleElement.setAttribute('data-gradient-search', 'true')
  styleElement.textContent = searchInputStyles
  document.head.appendChild(styleElement)
  searchStylesInjected = true
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ 
    placeholder = "Search...", 
    value, 
    onChange, 
    onKeyDown,
    onSearch,
    className = '', 
    id, 
    name,
    showButton = true,
    buttonText = "Search"
  }, ref) => {
    const [internalValue, setInternalValue] = React.useState('')
    const currentValue = value !== undefined ? value : internalValue

    React.useEffect(() => {
      injectSearchStyles()
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) {
        setInternalValue(e.target.value)
      }
      onChange?.(e)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSearch) {
        onSearch(currentValue)
      }
      onKeyDown?.(e)
    }

    const handleSearchClick = () => {
      onSearch?.(currentValue)
    }

    return (
      <div className={`gradient-search-container ${className}`}>
        <input
          ref={ref}
          type="text"
          className="gradient-search-input"
          placeholder={placeholder}
          value={currentValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          id={id}
          name={name}
        />
        {showButton && (
          <button 
            type="button"
            className="gradient-search-button"
            onClick={handleSearchClick}
          >
            {buttonText}
          </button>
        )}
      </div>
    )
  }
)

SearchInput.displayName = "SearchInput"

export { SearchInput }
