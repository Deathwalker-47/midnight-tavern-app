/**
 * jsdom test setup. Pulls in jest-dom's custom matchers (toBeInTheDocument, toHaveTextContent,
 * …) so component tests can assert against the rendered DOM. Referenced by vite.config.ts's
 * `setupFiles`.
 */
import "@testing-library/jest-dom/vitest";
