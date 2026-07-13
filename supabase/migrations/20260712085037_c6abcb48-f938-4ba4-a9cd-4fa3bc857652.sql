
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS link_url TEXT;

-- Seed default subjects for each stage/grade
INSERT INTO public.subjects (name, stage_group, grade_level)
SELECT s.name, s.stage_group::stage_group, s.grade_level::grade_level
FROM (VALUES
  -- Primary 1 & 2
  ('Arabic','primary_1_2','p1'),('English','primary_1_2','p1'),('French','primary_1_2','p1'),('Mathematics','primary_1_2','p1'),('Science','primary_1_2','p1'),('Religion','primary_1_2','p1'),
  ('Arabic','primary_1_2','p2'),('English','primary_1_2','p2'),('French','primary_1_2','p2'),('Mathematics','primary_1_2','p2'),('Science','primary_1_2','p2'),('Religion','primary_1_2','p2'),
  -- Primary 3–6
  ('Arabic','primary_3_6','p3'),('English','primary_3_6','p3'),('French','primary_3_6','p3'),('Mathematics','primary_3_6','p3'),('Science','primary_3_6','p3'),('Social Studies','primary_3_6','p3'),('Religion','primary_3_6','p3'),
  ('Arabic','primary_3_6','p4'),('English','primary_3_6','p4'),('French','primary_3_6','p4'),('Mathematics','primary_3_6','p4'),('Science','primary_3_6','p4'),('Social Studies','primary_3_6','p4'),('Religion','primary_3_6','p4'),
  ('Arabic','primary_3_6','p5'),('English','primary_3_6','p5'),('French','primary_3_6','p5'),('Mathematics','primary_3_6','p5'),('Science','primary_3_6','p5'),('Social Studies','primary_3_6','p5'),('Religion','primary_3_6','p5'),
  ('Arabic','primary_3_6','p6'),('English','primary_3_6','p6'),('French','primary_3_6','p6'),('Mathematics','primary_3_6','p6'),('Science','primary_3_6','p6'),('Social Studies','primary_3_6','p6'),('Religion','primary_3_6','p6'),
  -- Preparatory
  ('Arabic','preparatory','prep1'),('English','preparatory','prep1'),('French','preparatory','prep1'),('Mathematics','preparatory','prep1'),('Science','preparatory','prep1'),('Social Studies','preparatory','prep1'),('Religion','preparatory','prep1'),('Computer','preparatory','prep1'),
  ('Arabic','preparatory','prep2'),('English','preparatory','prep2'),('French','preparatory','prep2'),('Mathematics','preparatory','prep2'),('Science','preparatory','prep2'),('Social Studies','preparatory','prep2'),('Religion','preparatory','prep2'),('Computer','preparatory','prep2'),
  ('Arabic','preparatory','prep3'),('English','preparatory','prep3'),('French','preparatory','prep3'),('Mathematics','preparatory','prep3'),('Science','preparatory','prep3'),('Social Studies','preparatory','prep3'),('Religion','preparatory','prep3'),('Computer','preparatory','prep3'),
  -- Secondary
  ('Arabic','secondary','sec1'),('English','secondary','sec1'),('French','secondary','sec1'),('Mathematics','secondary','sec1'),('Physics','secondary','sec1'),('Chemistry','secondary','sec1'),('Biology','secondary','sec1'),('History','secondary','sec1'),('Geography','secondary','sec1'),('Philosophy','secondary','sec1'),('Religion','secondary','sec1'),
  ('Arabic','secondary','sec2'),('English','secondary','sec2'),('French','secondary','sec2'),('Mathematics','secondary','sec2'),('Physics','secondary','sec2'),('Chemistry','secondary','sec2'),('Biology','secondary','sec2'),('History','secondary','sec2'),('Geography','secondary','sec2'),('Philosophy','secondary','sec2'),('Religion','secondary','sec2'),
  ('Arabic','secondary','sec3'),('English','secondary','sec3'),('French','secondary','sec3'),('Mathematics','secondary','sec3'),('Physics','secondary','sec3'),('Chemistry','secondary','sec3'),('Biology','secondary','sec3'),('History','secondary','sec3'),('Geography','secondary','sec3'),('Philosophy','secondary','sec3'),('Religion','secondary','sec3')
) AS s(name, stage_group, grade_level)
ON CONFLICT (name, stage_group, grade_level) DO NOTHING;
