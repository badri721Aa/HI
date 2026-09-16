/** Import every page here so it registers itself (order = sidebar order, after the feature categories). */
import "./settings.js";
import "./theme.js";
import "./gallery.js";
import "./console.js";
import "./about.js";
export { registerPage, allPages } from "./page.js";
export type { Page, PageContext } from "./page.js";
