import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InvoiceHeaderForm from "../components/features/invoice/InvoiceHeaderForm";

vi.mock("../hooks/useActiveProfile", () => ({
  useActiveProfile: () => "profile-1",
}));

describe("InvoiceHeaderForm", () => {
  it("renders Invoice ID as an editable persisted value", () => {
    const noop = vi.fn();
    const setInvoiceIdPerPeriod = vi.fn();

    render(
      <InvoiceHeaderForm
        partyLabel="Seller Name"
        supplierName="Supplier A"
        setSupplierName={noop}
        address="Main Street"
        setAddress={noop}
        invoiceDate="2026-06-02"
        setInvoiceDate={noop}
        invoiceIdPerPeriod={12}
        setInvoiceIdPerPeriod={setInvoiceIdPerPeriod}
        kind="purchase"
      />,
    );

    const invoiceId = screen.getByLabelText("Invoice ID");

    expect(invoiceId).toHaveValue(12);
    expect(invoiceId).not.toHaveAttribute("readonly");

    fireEvent.change(invoiceId, { target: { value: "18" } });

    expect(setInvoiceIdPerPeriod).toHaveBeenCalledWith(18);
  });
});
