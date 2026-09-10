"""Small, bounded retries for public read-only scraper requests."""

import datetime
import time
from email.utils import parsedate_to_datetime

import requests


TRANSIENT_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRY_DELAY_SECONDS = 2.0


def retry_delay(response):
    value = response.headers.get("Retry-After")
    if value is None:
        return 0.5
    try:
        delay = float(value)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(value)
            delay = (retry_at - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
        except (TypeError, ValueError, OverflowError):
            return None
    # Defer to another source instead of retrying earlier than requested or
    # consuming the entire preview deadline waiting on a single source.
    return max(0.0, delay) if delay <= MAX_RETRY_DELAY_SECONDS else None


def get_with_retry(session, url, timeout, minimum_delay=0.5, **kwargs):
    """Try a GET at most twice; never retry permanent failures or TLS errors."""
    try:
        response = session.get(url, timeout=timeout, **kwargs)
    except requests.exceptions.SSLError:
        raise
    except (requests.Timeout, requests.ConnectionError):
        if minimum_delay > MAX_RETRY_DELAY_SECONDS:
            raise
        time.sleep(max(0.5, minimum_delay))
        return session.get(url, timeout=timeout, **kwargs)
    if response.status_code not in TRANSIENT_STATUSES:
        return response
    delay = retry_delay(response)
    if delay is None or minimum_delay > MAX_RETRY_DELAY_SECONDS:
        return response
    response.close()
    time.sleep(max(delay, minimum_delay))
    return session.get(url, timeout=timeout, **kwargs)
