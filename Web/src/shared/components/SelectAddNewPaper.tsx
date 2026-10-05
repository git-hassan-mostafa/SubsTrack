import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Paper, { type PaperProps } from "@mui/material/Paper";

export interface SelectAddNew {
  label: string;
  onPick: () => void;
}

declare module "@mui/material/Autocomplete" {
  interface AutocompletePaperSlotPropsOverrides {
    addNew?: SelectAddNew;
  }
}

// mousedown is cancelled so the box keeps focus until the click lands
export function SelectAddNewPaper({
  addNew,
  children,
  ...props
}: PaperProps & { addNew?: SelectAddNew }) {
  return (
    <Paper {...props}>
      {children}
      {addNew ? (
        <>
          <Divider />
          <Button
            fullWidth
            onMouseDown={(event) => event.preventDefault()}
            onClick={addNew.onPick}
            sx={{ justifyContent: "flex-start", px: 2, py: 1 }}
          >
            {addNew.label}
          </Button>
        </>
      ) : null}
    </Paper>
  );
}
