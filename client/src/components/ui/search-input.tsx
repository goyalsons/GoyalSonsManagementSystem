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
    height: 50px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(to bottom, rgb(227, 213, 255), rgb(255, 231, 231));
    border-radius: 30px;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.075);
    padding: 0 5px;
    min-width: 200px;
  }

  .gradient-search-input {
    flex: 1;
    height: 40px;
    border: none;
    outline: none;
    caret-color: rgb(255, 81, 0);
    background-color: rgb(255, 255, 255);
    border-radius: 30px;
    padding-left: 15px;
    padding-right: 10px;
    letter-spacing: 0.8px;
    color: rgb(19, 19, 19);
    font-size: 13.4px;
  }

  .gradient-search-input::placeholder {
    color: #999;
  }

  .gradient-search-button {
    height: 36px;
    padding: 0 16px;
    margin-left: 4px;
    border: none;
    border-radius: 30px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .gradient-search-button:hover {
    transform: scale(1.02);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
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
