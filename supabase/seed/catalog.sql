-- Catalog. Spec Appendix A. Nominal mass per metre in kg/m.
insert into catalog_profiles (family, size, kg_per_m) values
  ('HEA', 100, 16.7), ('HEB', 100, 20.4), ('IPE', 100, 8.1),
  ('HEA', 120, 19.9), ('HEB', 120, 26.7), ('IPE', 120, 10.4),
  ('HEA', 140, 24.7), ('HEB', 140, 33.7), ('IPE', 140, 12.9),
  ('HEA', 160, 30.4), ('HEB', 160, 42.6), ('IPE', 160, 15.8),
  ('HEA', 180, 35.5), ('HEB', 180, 51.2), ('IPE', 180, 18.8),
  ('HEA', 200, 42.3), ('HEB', 200, 61.3), ('IPE', 200, 22.4),
  ('HEA', 220, 50.5), ('HEB', 220, 71.5), ('IPE', 220, 26.2),
  ('HEA', 240, 60.3), ('HEB', 240, 83.2), ('IPE', 240, 30.7),
  ('HEA', 260, 68.2), ('HEB', 260, 93.0),
  ('IPE', 270, 36.1),
  ('HEA', 280, 76.4), ('HEB', 280, 103.0),
  ('HEA', 300, 88.3), ('HEB', 300, 117.0), ('IPE', 300, 42.2),
  ('HEA', 320, 97.6), ('HEB', 320, 127.0),
  ('IPE', 330, 49.1),
  ('HEA', 340, 105.0), ('HEB', 340, 134.0),
  ('HEA', 360, 112.0), ('HEB', 360, 142.0), ('IPE', 360, 57.1),
  ('HEA', 400, 125.0), ('HEB', 400, 155.0), ('IPE', 400, 66.3),
  ('HEA', 450, 140.0), ('HEB', 450, 171.0), ('IPE', 450, 77.6),
  ('HEA', 500, 155.0), ('HEB', 500, 187.0), ('IPE', 500, 90.7)
on conflict (family, size) do update set kg_per_m = excluded.kg_per_m;

-- Base cost per kg at 2025-01-01. Spec section 2.6.
insert into catalog_materials (grade, eur_per_kg_base) values
  ('S235', 0.98),
  ('S355', 1.05),
  ('S460', 1.18)
on conflict (grade) do update set eur_per_kg_base = excluded.eur_per_kg_base;
