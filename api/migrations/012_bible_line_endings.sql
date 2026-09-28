-- The first copy of the Bible files carried Windows line endings into each
-- verse. The files are fixed; this cleans what was already loaded.
update bible_verses set text = rtrim(text, E'\r\n ') where text ~ E'[\r\n]$';
