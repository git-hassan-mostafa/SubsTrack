import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, View } from "react-native";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { getDb } from "@/src/core/offline/db/sqlite";

const CELL_WIDTH = 140;

interface DbTableViewerProps {
  tableName: string;
}

/**
 * Read-only local-SQLite table grid for the Developer screen. Deliberately
 * self-contained (queries the DB itself, derives its own columns) instead of
 * going through the app's normal service/repository layering — this is a
 * debug-only tool nobody but a developer ever sees, so it isn't worth the
 * usual layering ceremony. Never call this pattern from real app screens.
 */
export function DbTableViewer({ tableName }: DbTableViewerProps) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const result = await getDb().getAllAsync<Record<string, unknown>>(
          `SELECT * FROM ${tableName}`,
        );
        if (!cancelled) setRows(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableName]);

  if (error) {
    return (
      <View className="p-4">
        <Text className="text-danger text-sm">{error}</Text>
      </View>
    );
  }

  if (!rows) {
    return (
      <View className="p-8 items-center">
        <ActivityIndicator color={COLORS.gray400} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View className="p-8 items-center">
        <Text className="text-sm text-gray-400">No rows</Text>
      </View>
    );
  }

  const columns = Object.keys(rows[0]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        {/* Header row */}
        <View className="flex-row bg-gray-100 border-b border-gray-200">
          {columns.map((col) => (
            <View key={col} style={{ width: CELL_WIDTH }} className="px-3 py-2 border-r border-gray-200">
              <Text fontWeight="SemiBold" className="text-xs text-gray-700" numberOfLines={1}>
                {col}
              </Text>
            </View>
          ))}
        </View>

        {/* Rows */}
        <FlatList
          data={rows}
          keyExtractor={(_, index) => String(index)}
          renderItem={({ item, index }) => (
            <View
              className={`flex-row border-b border-gray-100 ${index % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
            >
              {columns.map((col) => {
                const value = item[col];
                const isNull = value === null || value === undefined;
                return (
                  <View key={col} style={{ width: CELL_WIDTH }} className="px-3 py-2 border-r border-gray-100">
                    <Text
                      className={isNull ? "text-xs text-gray-300 italic" : "text-xs text-gray-900"}
                      numberOfLines={2}
                    >
                      {isNull ? "NULL" : String(value)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        />
      </View>
    </ScrollView>
  );
}
