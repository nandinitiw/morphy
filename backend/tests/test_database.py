"""Tests for db/database.py URL handling."""
from db.database import normalize_database_url


class TestNormalizeDatabaseUrl:
    def test_rewrites_postgres_scheme(self):
        # Render/Heroku emit postgres://; SQLAlchemy 2 only accepts postgresql://
        assert normalize_database_url("postgres://u:p@host:5432/db") == "postgresql://u:p@host:5432/db"

    def test_leaves_postgresql_scheme_alone(self):
        url = "postgresql://u:p@host:5432/db"
        assert normalize_database_url(url) == url

    def test_leaves_sqlite_alone(self):
        url = "sqlite:///./morphy.db"
        assert normalize_database_url(url) == url

    def test_preserves_credentials_and_query_params(self):
        url = "postgres://user:pa%40ss@host:5432/db?sslmode=require"
        assert normalize_database_url(url) == "postgresql://user:pa%40ss@host:5432/db?sslmode=require"

    def test_does_not_rewrite_substring_match(self):
        # Only the scheme prefix should ever be rewritten
        url = "sqlite:///./postgres://weird.db"
        assert normalize_database_url(url) == url
