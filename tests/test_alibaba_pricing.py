"""Catalogue accounting tests; no provider or database access."""

import unittest

from origins.domain.provider_pricing import PRICE_VERSION, transcription_cost


class AlibabaPricingTests(unittest.TestCase):
    def test_singapore_asr_uses_measured_seconds_without_minimum_minute(self):
        cost = transcription_cost(23_600, "intl")
        self.assertEqual(cost.catalog_cost, 0.000826)
        self.assertEqual(cost.catalog_rate, "0.000035")
        self.assertEqual(cost.cost_basis, "catalog_duration")
        self.assertEqual(cost.price_version, PRICE_VERSION)

    def test_beijing_rate_is_distinct_and_zero_is_free(self):
        self.assertEqual(transcription_cost(1_000, "beijing").catalog_cost, 0.000032)
        self.assertEqual(transcription_cost(0, "intl").catalog_cost, 0.0)

    def test_unknown_region_fails_closed_to_international_catalogue(self):
        cost = transcription_cost(1_000, "something-else")
        self.assertEqual(cost.provider_region, "intl")
        self.assertEqual(cost.catalog_cost, 0.000035)


if __name__ == "__main__":
    unittest.main()
