// The customer texts of the two scenarios. Spec 7.1 and 7.2. Kept apart so that the scenario
// modules, the AI inputs and the replay recorder can all import them without a cycle.

export const A_SOURCE_TEXT = `Subject: Request for quotation - Linz warehouse extension

Hello Marta,

following our call on Monday, please quote the following for the Linz warehouse extension:

- 120 pcs HEA 200 in S355, 12 m, same as our order from last year;
- 40 pcs HEA 220 in S355, 10 m.

Delivery would be needed by the end of November. Please confirm the validity of the offer.

Best regards,
Tomas Riedel
Ebrecht Fabrication`

export const A_REPLY_1 = `Hello Marta,

thanks for the offer. Line 1 (HEA 200) is fine, please go ahead at the quoted price.
For line 2 we now need 60 pieces instead of 40. Given the higher volume we expect a better unit price than in your offer.

Regards,
Tomas`

export const A_REPLY_2 = `Line 2 at 60 pieces is accepted at the revised price. Please proceed with both lines.
Tomas`

export const B_SOURCE_TEXT = `Subject: RFQ - Bridge maintenance platform, Salzburg

Dear Ms Keller,

for the maintenance platform project we need:
1) HEA 240 in S460, 14 m long, 100 pieces
2) IPE 300 in S355, 12 m, 80 pieces

Please send your best offer. The S460 beams are the critical item for the structural design.

Kind regards,
Ingrid Maurer
Torvane Structures`

export const B_REPLY_1 = `Dear Ms Keller,

the IPE 300 line is accepted, please proceed with it.
For the HEA 240 in S460 we wait for your technical confirmation of the 14 m length before we accept.

Kind regards,
Ingrid Maurer`

export const B_REPLY_2 = `We accept the HEA 260 in S355 at 14 m as proposed, 100 pieces, at the revised price.
Ingrid Maurer`
