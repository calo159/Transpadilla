// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog, type ConfirmOpts } from "./ConfirmDialog";

afterEach(cleanup);

const opts = (over: Partial<ConfirmOpts> = {}): ConfirmOpts => ({
  titulo: "Eliminar ruta",
  descripcion: "¿Seguro?",
  textoConfirmar: "Eliminar",
  accion: vi.fn(),
  ...over,
});

describe("ConfirmDialog", () => {
  it("muestra título y descripción cuando hay opts", () => {
    render(<ConfirmDialog opts={opts()} onClose={() => {}} />);
    expect(screen.getByText("Eliminar ruta")).toBeTruthy();
    expect(screen.getByText("¿Seguro?")).toBeTruthy();
  });

  it("al confirmar ejecuta la acción y cierra", async () => {
    const accion = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog opts={opts({ accion })} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(accion).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("al cancelar cierra sin ejecutar la acción", async () => {
    const accion = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog opts={opts({ accion })} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(accion).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no muestra nada cuando opts es null", () => {
    render(<ConfirmDialog opts={null} onClose={() => {}} />);
    expect(screen.queryByText("Eliminar ruta")).toBeNull();
  });
});
