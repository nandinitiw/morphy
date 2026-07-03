"""Tests for analysis/jobs.py — job creation and active-job dedupe."""
from analysis.jobs import create_ingest_job, get_active_job


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
