/**
 * Full-text search input across the vault (title / url / domain). Controlled —
 * the actual `core/search` run and result rendering live in the tree pane.
 */
export interface SearchBarProps {
  value: string;
  onInput: (value: string) => void;
  resultCount?: number;
  placeholder?: string;
}

export function SearchBar({
  value,
  onInput,
  resultCount,
  placeholder,
}: SearchBarProps) {
  const showCount = value.trim().length > 0 && resultCount !== undefined;
  return (
    <div class="etg-searchbar">
      <input
        type="search"
        class="etg-input etg-searchbar__input"
        placeholder={placeholder ?? 'Search saved tabs…'}
        value={value}
        aria-label="Search saved tabs"
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
      />
      {showCount ? (
        <span class="etg-searchbar__count">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </span>
      ) : null}
    </div>
  );
}
