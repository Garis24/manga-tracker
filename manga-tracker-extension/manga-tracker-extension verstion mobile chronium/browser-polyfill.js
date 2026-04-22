// Compat Chrome + Firefox + mobile
export const api =
  typeof browser !== "undefined"
    ? browser
    : chrome;