// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LogoTP } from "./LogoTP";

afterEach(cleanup);

describe("LogoTP", () => {
  it("renderiza la imagen del logo con texto alternativo accesible", () => {
    render(<LogoTP size={48} />);
    const img = screen.getByAltText("TransPadilla") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("logo-transpadilla.png");
    // width/height presentes (evita layout shift).
    expect(img.getAttribute("width")).toBe("48");
    expect(img.getAttribute("height")).toBe("48");
  });
});
