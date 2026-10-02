import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import ClearIcon from "@mui/icons-material/Clear";
import SearchIcon from "@mui/icons-material/Search";
import { useDebounce } from "@shared/shared/hooks/useDebounce";

interface SearchFieldProps {
  value: string;
  onSearch: (term: string) => void;
  placeholder?: string;
}

// Owns the typed text; the list hears it once typing pauses, and only if it differs.
export function SearchField({ value, onSearch, placeholder }: SearchFieldProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const term = useDebounce(text.trim(), 300);
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== term) setText(value);
  }
  const label = placeholder ?? t("common.input_search");

  const latest = useRef({ value, onSearch });
  useEffect(() => {
    latest.current = { value, onSearch };
  });

  useEffect(() => {
    if (term !== latest.current.value) latest.current.onSearch(term);
  }, [term]);

  return (
    <TextField
      size="small"
      value={text}
      onChange={(event) => setText(event.target.value)}
      placeholder={label}
      sx={{ width: { xs: "100%", sm: 280 } }}
      slotProps={{
        htmlInput: { "aria-label": label },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: text ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label={t("common.clear")}
                onClick={() => setText("")}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}
