// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

function Bomba(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("muestra la pantalla de error cuando un hijo lanza", () => {
    // El boundary registra el error en consola; lo silenciamos para no ensuciar.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Algo salió mal")).toBeTruthy();
    expect(screen.getByRole("button", { name: /recargar/i })).toBeTruthy();
    spy.mockRestore();
  });

  it("renderiza el contenido normal cuando no hay error", () => {
    render(
      <ErrorBoundary>
        <p>Todo bien</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Todo bien")).toBeTruthy();
    expect(screen.queryByText("Algo salió mal")).toBeNull();
  });
});
