export const designTokens = {
  color: {
    background: "#F7F7F8",
    border: "#E4E4E7",
    infoSurface: "#F4F4F5",
    mutedText: "#71717A",
    primary: "#18181B",
    primaryHover: "#27272A",
    success: "#15803D",
    successSurface: "#ECFDF3",
    surface: "#FFFFFF",
    text: "#18181B",
  },
  font: {
    family: 'Geist, "Geist Fallback", Arial, Helvetica, sans-serif',
    size: {
      body: "14px",
      control: "14px",
      label: "13px",
      pageTitle: "30px",
    },
  },
  radius: {
    button: "8px",
    card: "12px",
    compact: "5px",
    control: "8px",
    panel: "16px",
  },
  size: {
    containerLg: "1200px",
    control: "40px",
    mobileTouchTarget: "44px",
  },
  space: {
    compact: "8px",
    default: "12px",
    page: "24px",
    relaxed: "16px",
  },
} as const;
