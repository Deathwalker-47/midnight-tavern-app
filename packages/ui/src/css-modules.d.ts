/** Ambient declaration so `import styles from "./x.module.css"` type-checks. */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module "*.css";
