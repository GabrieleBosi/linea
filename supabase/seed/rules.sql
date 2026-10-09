-- Feasibility rules. Spec section 2.7. Null family or material means "any".
insert into feasibility_rules (id, family, size_min, size_max, material, max_length_mm, min_quantity, not_offered, note) values
  ('F1a', 'HEA', 240, null, 'S460', 12000, null, false, 'S460 in this size rolls to 12 m maximum.'),
  ('F1b', 'HEB', 240, null, 'S460', 12000, null, false, 'S460 in this size rolls to 12 m maximum.'),
  ('F2',  null,  null, null, null,   15000, null, false, 'Above 15 m needs a transport and handling review.'),
  ('F3',  'IPE', null, null, 'S460', null,  null, true,  'IPE is not produced in S460. Propose HEA or S355.'),
  ('F4',  null,  null, null, null,   null,  20,   false, 'Below 20 pieces the mill needs a batch review.')
on conflict (id) do update set
  family = excluded.family,
  size_min = excluded.size_min,
  size_max = excluded.size_max,
  material = excluded.material,
  max_length_mm = excluded.max_length_mm,
  min_quantity = excluded.min_quantity,
  not_offered = excluded.not_offered,
  note = excluded.note;
