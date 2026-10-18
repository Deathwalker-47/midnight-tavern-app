import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageActions } from "../../src/components/MessageActions";

describe("MessageActions history controls", () => {
  it("keeps rewind and delete-from as separate explicit actions", () => {
    const rewind = vi.fn();
    const deleteFrom = vi.fn();
    render(
      <MessageActions
        variantIndex={1}
        variantCount={1}
        isLatest={false}
        onRewindToHere={rewind}
        onDeleteFromHere={deleteFrom}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /rewind to here/i }));
    expect(rewind).toHaveBeenCalledOnce();
    expect(deleteFrom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Message actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete from this exchange/i }));
    expect(deleteFrom).toHaveBeenCalledOnce();
  });

  it("offers no rewind or delete while a turn is running", () => {
    // Live v0.3.0 (2026-10-18, bug B7): two "Rewind to here" clicks during a running turn deleted
    // its player message mid-generation; the cancel then failed on the missing row.
    const rewind = vi.fn();
    const deleteFrom = vi.fn();
    render(
      <MessageActions
        variantIndex={1}
        variantCount={1}
        isLatest={false}
        busy
        onRewindToHere={rewind}
        onDeleteFromHere={deleteFrom}
      />
    );

    const menu = screen.getByRole("button", { name: "Message actions" });
    expect(menu).toBeDisabled();
    fireEvent.click(menu);
    expect(screen.queryByRole("menuitem", { name: /rewind to here/i })).not.toBeInTheDocument();
    expect(rewind).not.toHaveBeenCalled();
    expect(deleteFrom).not.toHaveBeenCalled();
  });
});
