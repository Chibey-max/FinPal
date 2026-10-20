"use client";

import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * AG Grid themed with the FinPal tokens (shared by Decisions and Activity),
 * so grids follow light/dark live and use the app's type system.
 */
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "transparent",
  foregroundColor: "var(--ink)",
  textColor: "var(--ink)",
  accentColor: "var(--brand)",
  borderColor: "var(--w05)",
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  headerBackgroundColor: "var(--panels)",
  headerTextColor: "var(--ink3)",
  headerFontFamily: "var(--font-code)",
  headerFontSize: 10.5,
  headerFontWeight: 400,
  headerHeight: 38,
  headerColumnBorder: { color: "var(--w06)" },
  headerRowBorder: { color: "var(--w1)" },
  rowBorder: { color: "var(--w05)" },
  rowHoverColor: "var(--w02)",
  selectedRowBackgroundColor: "var(--w04)",
  rowHeight: 40,
  columnBorder: false,
  fontFamily: "var(--font-ui)",
  fontSize: 13,
  cellHorizontalPadding: 14,
  iconSize: 12,
  inputBackgroundColor: "var(--inset)",
  inputBorder: { color: "var(--w12)" },
  menuBackgroundColor: "var(--toast)",
  menuBorder: { color: "var(--w1)" },
});
