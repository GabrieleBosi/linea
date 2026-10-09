/** The public demo build: `vite build --mode static`. No database, no functions, recorded AI outputs. */
export const isStaticBuild = (import.meta.env.VITE_DATA_MODE as string | undefined) === 'static'
