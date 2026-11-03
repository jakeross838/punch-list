export interface ToastRequest {
  message: string;
  action?: { label: string; onPress: () => void };
}

export interface ActionSheetRequest {
  title?: string;
  message?: string;
  actions: { label: string; destructive?: boolean; onPress: () => void }[];
  cancelLabel?: string;
  /** Cancel, or a tap outside the sheet. */
  onCancel?: () => void;
}
