export const MSG_START_PICKER = 'START_PICKER' as const;

export type PickerMessage = {
  action: typeof MSG_START_PICKER;
};
