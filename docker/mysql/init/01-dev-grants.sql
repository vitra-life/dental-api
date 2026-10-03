-- Runs once, when the data volume is first created.
-- `prisma migrate dev` creates and drops a temporary "shadow" database, so the
-- development user needs rights outside its own schema. Local development only:
-- a production user should be limited to the application database.
GRANT ALL PRIVILEGES ON *.* TO 'dental'@'%';
FLUSH PRIVILEGES;
