import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import { PAGE_SIZE } from "@/src/core/constants";
import { COLORS } from "@/src/shared/constants";

interface AsyncEntityPickerProps<T> {
  label?: string;
  placeholder?: string;
  value: T | null;
  onChange: (item: T | null) => void;
  // Returns one page of results for the given search term + zero-indexed page.
  // The caller decides what "search" means against their backing store
  // (CustomerRepository, ProductRepository, etc.).
  loadPage: (search: string, page: number) => Promise<T[]>;
  renderItem: (item: T) => { label: string; sublabel?: string };
  getKey: (item: T) => string;
  // Optional: render the trigger's selected-label differently (e.g., bold last name).
  // Defaults to renderItem(value).label.
  formatSelectedLabel?: (item: T) => string;
  nullable?: boolean;
  nullLabel?: string;
  pageSize?: number;
  disabled?: boolean;
}

interface AsyncPickerModalProps<T> {
  onClose: () => void;
  title: string;
  value: T | null;
  onChange: (item: T | null) => void;
  loadPage: (search: string, page: number) => Promise<T[]>;
  renderItem: (item: T) => { label: string; sublabel?: string };
  getKey: (item: T) => string;
  nullable: boolean;
  nullLabel?: string;
  pageSize: number;
}

// Reusable input + modal for picking an entity from a paginated, server-side-
// searchable backing store. Mirrors DropdownModal visually but the data comes
// from an async callback instead of a pre-loaded options array. Use this any
// time the option list is too large to fit in memory (customers, large product
// catalogs, sale history references). Smaller static lists should keep using
// Dropdown.
export function AsyncEntityPicker<T>({
  label,
  placeholder,
  value,
  onChange,
  loadPage,
  renderItem,
  getKey,
  formatSelectedLabel,
  nullable = false,
  nullLabel,
  pageSize = PAGE_SIZE,
  disabled = false,
}: AsyncEntityPickerProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const displayLabel =
    value != null
      ? (formatSelectedLabel?.(value) ?? renderItem(value).label)
      : nullable
        ? (nullLabel ?? null)
        : null;

  return (
    <View className="mb-4">
      {label ? (
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          {label}
        </Text>
      ) : null}

      <PressableOpacity
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`border border-gray-200 rounded-xl px-4 py-3 flex-row items-center justify-between ${
          disabled ? "bg-gray-50" : "bg-white"
        }`}
      >
        <Text
          className={`text-base flex-1 ${
            displayLabel ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {displayLabel ?? placeholder ?? t("common.input_search")}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.gray400} />
      </PressableOpacity>

      {open && (
        <AsyncPickerModal<T>
          onClose={() => setOpen(false)}
          title={label ?? placeholder ?? ""}
          value={value}
          onChange={onChange}
          loadPage={loadPage}
          renderItem={renderItem}
          getKey={getKey}
          nullable={nullable}
          nullLabel={nullLabel}
          pageSize={pageSize}
        />
      )}
    </View>
  );
}

function AsyncPickerModal<T>({
  onClose,
  title,
  value,
  onChange,
  loadPage,
  renderItem,
  getKey,
  nullable,
  nullLabel,
  pageSize,
}: AsyncPickerModalProps<T>) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Token cancels in-flight responses when the search term changes mid-fetch.
  // Mirrors customerSlice.searchToken (CLAUDE.md §11) — without this, a slow
  // first response can overwrite a faster second one.
  const requestTokenRef = useRef(0);

  const loadFirstPage = useCallback(async (term: string) => {
    const token = ++requestTokenRef.current;
    setItems([]);
    setLoading(true);
    setError(null);
    setPage(0);
    try {
      const next = await loadPage(term, 0);
      if (requestTokenRef.current !== token) return setLoading(false);
      setItems(next);
      setHasMore(next.length === pageSize);
    } catch (e) {
      if (requestTokenRef.current !== token) return setLoading(false);
      setError((e as Error).message);
    } finally {
      if (requestTokenRef.current === token) setLoading(false);
    }
  }, []);

  const loadNextPage = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    const token = ++requestTokenRef.current;
    setLoadingMore(true);
    try {
      const next = await loadPage(debouncedSearch, page + 1);
      if (requestTokenRef.current !== token) return setLoadingMore(false);
      setItems((prev) => [...prev, ...next]);
      setPage((p) => p + 1);
      setHasMore(next.length === pageSize);
    } catch (e) {
      if (requestTokenRef.current !== token) return setLoadingMore(false);
      setError((e as Error).message);
    } finally {
      if (requestTokenRef.current === token) setLoadingMore(false);
    }
  }, [debouncedSearch, hasMore, loading, loadingMore, page]);

  // Reset and reload whenever the modal opens or the search term changes.
  useEffect(() => {
    loadFirstPage(debouncedSearch);
  }, [debouncedSearch, loadFirstPage]);

  function handleClose() {
    setSearch("");
    setItems([]);
    setPage(0);
    setHasMore(true);
    setError(null);
    onClose();
  }

  function handleSelect(item: T | null) {
    onChange(item);
    handleClose();
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
      <Pressable
        className="flex-1 bg-black/40 items-center justify-center px-6"
        onPress={handleClose}
      >
        <Pressable
          className="bg-white rounded-2xl w-full overflow-hidden"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
            <Text className="text-base font-semibold text-gray-900">
              {title}
            </Text>
            <PressableOpacity onPress={handleClose}>
              <Text className="text-base text-primary font-medium">
                {t("common.cancel")}
              </Text>
            </PressableOpacity>
          </View>

          <View className="px-4 py-2 border-b border-gray-100">
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("common.input_search")}
              placeholderTextColor={COLORS.gray400}
              className="bg-gray-50 rounded-xl px-4 py-2.5 text-base text-gray-900"
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          {nullable ? (
            <PressableOpacity
              onPress={() => handleSelect(null)}
              className={`flex-row items-center px-5 py-3.5 border-b border-gray-50 ${
                value === null ? "bg-indigo-50" : "bg-white"
              }`}
            >
              <View className="flex-1">
                <Text
                  className={`text-base font-semibold ${
                    value === null ? "text-primary" : "text-gray-900"
                  }`}
                >
                  {nullLabel ?? t("common.none")}
                </Text>
              </View>
              {value === null ? (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              ) : null}
            </PressableOpacity>
          ) : null}

          {error ? (
            <View className="px-5 py-4 bg-red-50">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          <FlatList
            data={items}
            keyExtractor={getKey}
            style={{ maxHeight: 400 }}
            onEndReached={loadNextPage}
            onEndReachedThreshold={0.3}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              loading ? (
                <View className="py-8 items-center">
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : (
                <View className="py-8 items-center">
                  <Text className="text-sm text-gray-400">
                    {t("common.no_results")}
                  </Text>
                </View>
              )
            }
            ListFooterComponent={
              loadingMore ? (
                <View className="py-4 items-center">
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const { label: itemLabel, sublabel } = renderItem(item);
              const isSelected =
                value != null && getKey(item) === getKey(value);
              return (
                <PressableOpacity
                  onPress={() => handleSelect(item)}
                  className={`flex-row items-center px-5 py-3.5 border-b border-gray-50 ${
                    isSelected ? "bg-indigo-50" : "bg-white"
                  }`}
                >
                  <View className="flex-1">
                    <Text
                      className={`text-base font-semibold ${
                        isSelected ? "text-primary" : "text-gray-900"
                      }`}
                    >
                      {itemLabel}
                    </Text>
                    {sublabel ? (
                      <Text className="text-xs text-gray-400 mt-0.5">
                        {sublabel}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={COLORS.primary}
                    />
                  ) : null}
                </PressableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
