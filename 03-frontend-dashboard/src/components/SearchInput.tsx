import { Search } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
}

const SearchInput = ({ value, onChange, onSubmit, disabled }: SearchInputProps) => {
  return (
    <div className="glass-input flex items-center gap-3 px-5 py-4 w-full max-w-2xl">
      <Search className="h-5 w-5 text-muted-foreground shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
        placeholder="What do you want to learn about?"
        disabled={disabled}
        className="bg-transparent w-full text-foreground placeholder:text-muted-foreground outline-none text-lg disabled:opacity-50"
      />
    </div>
  );
};

export default SearchInput;
