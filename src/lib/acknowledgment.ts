/** Days the renter has to review and sign a move-in report before it is deemed accepted. */
export const REVIEW_DAYS = 5;

/**
 * Addendum language printed on the move-in report and shown above the sign-off,
 * so the signed report itself is the tenant's acknowledgment of move-in condition.
 */
export const MOVE_IN_ACKNOWLEDGMENT = {
  title: "Move-In Condition Report - Addendum to Lease",
  paragraphs: [
    "This Move-In Condition Report (\"Report\") is an addendum to, and part of, the Lease for the Property identified above. It records the condition of the Property and its contents, including date-stamped photographs, at the start of the tenancy.",
    `Tenant must review this Report and, within ${REVIEW_DAYS} days after receiving it, (1) record any additions, corrections or disagreements as comments in this Report or in a signed written note attached to it, and (2) sign this Report. Tenant's comments become part of this Report.`,
    "Tenant's signature confirms that Tenant has reviewed this Report. It does not mean Tenant agrees with any item Tenant has commented on or disputed.",
    `If Tenant does not sign or comment on this Report within ${REVIEW_DAYS} days after receiving it, this Report as prepared by Landlord will be considered accurate and accepted by Tenant.`,
    "The signed Report, with any Tenant comments, is the agreed record of the Property's condition at move-in. At move-out, the Property will be compared against this Report to decide whether there is damage beyond normal wear and tear and whether any deductions from the security deposit are justified.",
    "This Report is not a request for repairs. Repair requests must be made as provided in the Lease. Electronic signatures on this Report are as valid as handwritten ones.",
  ],
};
