-- Migration: Add name and isAdmin columns to user table
-- Date: 2025-10-16

ALTER TABLE user ADD COLUMN name VARCHAR;
ALTER TABLE user ADD COLUMN isAdmin INTEGER DEFAULT 0;
