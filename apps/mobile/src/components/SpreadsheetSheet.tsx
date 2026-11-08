// The preview page's look at the spreadsheet before it downloads: the columns and the first rows,
// as Excel or Numbers would open them. On the iPhone there is no such step: the share sheet opens
// straight away, to save the file or open it in Excel or Numbers. Some pages that show the preview
// cannot download files, so what is in the spreadsheet can always be seen here.

import { SHEET_COLUMNS } from '@punch/core';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { Banner, Sheet, Text } from '@/ui';

/** Rows drawn here; the file has every one. */
const SHOWN = 40;

const WIDE = new Set<string>(['Title', 'Description', 'Waiting On', 'Checklist']);
const width = (column: string) => (WIDE.has(column) ? 220 : column === 'Number' ? 76 : 132);

export function SpreadsheetSheet({
  visible,
  fileName,
  rows,
  onDownload,
  onClose,
}: {
  visible: boolean;
  fileName: string;
  /** The items as rows, without the column names. */
  rows: string[][];
  onDownload: () => void;
  onClose: () => void;
}) {
  const shown = rows.slice(0, SHOWN);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Spreadsheet"
      left={{ label: 'Close', onPress: onClose, testID: 'spreadsheet-close' }}
      right={{ label: 'Download', variant: 'prominent', onPress: onDownload, testID: 'spreadsheet-download' }}
      testID="spreadsheet-sheet"
    >
      <ScrollView contentContainerStyle={styles.page}>
        <Text variant="stamp" color={colors.secondary} style={styles.file}>
          {fileName}
        </Text>
        <Text variant="subheadline" color={colors.secondary} style={styles.about}>
          {`${rows.length} ${rows.length === 1 ? 'item' : 'items'}, one to a row.${rows.length > SHOWN ? ` The first ${SHOWN} show here; the file has them all.` : ''}`}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator scrollsToTop={false} style={styles.table} testID="spreadsheet-table">
          <View>
            <View style={[styles.row, styles.head]}>
              {SHEET_COLUMNS.map((c) => (
                <Text key={c} variant="stamp" weight="600" color={colors.label} numberOfLines={1} style={[styles.cell, { width: width(c) }]}>
                  {c}
                </Text>
              ))}
            </View>
            {shown.map((r, i) => (
              <View key={i} style={styles.row}>
                {SHEET_COLUMNS.map((c, j) => (
                  <Text key={c} variant="footnote" color={colors.label} numberOfLines={2} style={[styles.cell, { width: width(c) }]}>
                    {r[j] ?? ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
        <Banner>On the iPhone, Export to a Spreadsheet opens the share sheet: save it to Files, or open it in Excel or Numbers.</Banner>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 40 },
  file: { marginHorizontal: layout.margin, marginTop: 16 },
  about: { marginHorizontal: layout.margin, marginTop: 6, marginBottom: 12 },
  table: { marginHorizontal: layout.margin, marginBottom: 14, borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.cell },
  row: { flexDirection: 'row', borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  head: { backgroundColor: colors.stripe },
  cell: { paddingHorizontal: 10, paddingVertical: 8 },
});
