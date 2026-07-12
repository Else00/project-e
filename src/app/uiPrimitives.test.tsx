import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ParameterLabel, RichHelpText, stripHelpMarkup } from "./uiPrimitives";

describe("rich help text", () => {
  it("renders local markdown-like help without exposing markup in labels", () => {
    const value =
      "**Mode** uses [B]{.term-b} by default.\n\nUse `Bm` for wider geometry, _manual_ tests and [raw]{.unsafe}.";

    const { container } = render(<RichHelpText value={value} />);

    expect(stripHelpMarkup(value)).toBe(
      "Mode uses B by default. Use Bm for wider geometry, manual tests and raw.",
    );
    expect(screen.getByText("Mode").tagName).toBe("STRONG");
    expect(screen.getByText("B")).toHaveClass("tooltip-term", "term-b");
    expect(screen.getByText("Bm").tagName).toBe("CODE");
    expect(screen.getByText("manual").tagName).toBe("EM");
    expect(container).toHaveTextContent("[raw]{.unsafe}");
    expect(container.querySelector(".unsafe")).toBeNull();
  });

  it("opens parameter tooltips above the info icon when lower viewport space is tight", async () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 360 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 420 });
    const user = userEvent.setup();

    function Harness() {
      const [active, setActive] = useState(false);
      return (
        <ParameterLabel
          active={active}
          help="**Mode** selects [B]{.term-b}."
          label="Mode"
          onToggle={() => setActive((current) => !current)}
        />
      );
    }

    render(<Harness />);
    const info = screen.getByRole("button", { name: /Parameter detail:/ });
    vi.spyOn(info, "getBoundingClientRect").mockReturnValue({
      bottom: 332,
      height: 21,
      left: 188,
      right: 209,
      top: 311,
      width: 21,
      x: 188,
      y: 311,
      toJSON: () => ({}),
    });

    await user.click(info);

    const tooltip = await screen.findByRole("tooltip");
    await waitFor(() => expect(tooltip).toHaveAttribute("data-placement", "top"));
    expect(tooltip.getAttribute("style")).toContain("--tooltip-arrow-left");
    expect(tooltip.getAttribute("style")).toContain("--tooltip-top");
  });
});
