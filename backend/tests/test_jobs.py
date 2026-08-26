"""Tests for analysis/jobs.py — job creation, active-job dedupe, stale reaping."""
from datetime import datetime, timedelta

from analysis.jobs import (
    STALE_JOB_MINUTES,
    _reap_stale_jobs,
    create_ingest_job,
    get_active_job,
)


class TestStaleJobReaping:
    """A job whose worker died must not block the user from re-running forever."""

    def _stale(self, db, username="alice", status="ingesting"):
        job = create_ingest_job(username, db)
        job.status = status
        job.updated_at = datetime.now() - timedelta(minutes=STALE_JOB_MINUTES + 5)
        db.commit()
        return job

    def test_stale_job_is_reaped_and_unblocks_user(self, db):
        job = self._stale(db)
        assert get_active_job("alice", db) is None
        db.refresh(job)
        assert job.status == "failed"
        assert "restarted" in (job.error or "")

    def test_fresh_job_is_not_reaped(self, db):
        job = create_ingest_job("alice", db)
        job.status = "analyzing"
        job.updated_at = datetime.now()
        db.commit()
        active = get_active_job("alice", db)
        assert active is not None and active.id == job.id

    def test_reaping_is_scoped_to_the_user(self, db):
        self._stale(db, username="alice")
        other = create_ingest_job("bob", db)
        other.status = "ingesting"
        other.updated_at = datetime.now() - timedelta(minutes=STALE_JOB_MINUTES + 5)
        db.commit()
        _reap_stale_jobs("alice", db)
        db.refresh(other)
        assert other.status == "ingesting"  # bob's job untouched

    def test_completed_jobs_are_left_alone(self, db):
        job = create_ingest_job("alice", db)
        job.status = "completed"
        job.updated_at = datetime.now() - timedelta(days=30)
        db.commit()
        assert _reap_stale_jobs("alice", db) == 0
        db.refresh(job)
        assert job.status == "completed"


class TestActiveJobDedupe:
    def test_no_active_job_initially(self, db):
        assert get_active_job("alice", db) is None

    def test_pending_job_is_active(self, db):
        job = create_ingest_job("alice", db)
        active = get_active_job("alice", db)
        assert active is not None
        assert active.id == job.id

    def test_running_statuses_are_active(self, db):
        job = create_ingest_job("alice", db)
        for status in ("ingesting", "analyzing", "profiling"):
            job.status = status
            db.commit()
            assert get_active_job("alice", db) is not None, status

    def test_completed_job_is_not_active(self, db):
        job = create_ingest_job("alice", db)
        job.status = "completed"
        db.commit()
        assert get_active_job("alice", db) is None

    def test_failed_job_is_not_active(self, db):
        job = create_ingest_job("alice", db)
        job.status = "failed"
        db.commit()
        assert get_active_job("alice", db) is None

    def test_active_job_scoped_to_username(self, db):
        create_ingest_job("alice", db)
        assert get_active_job("bob", db) is None
