Feature: Ask Advisor
  Scenario: Ask Advisor pulls Primary Transcript View, then delivers a Hint through Steer
    Given a Pi RPC session with an Advisor model
    And the Primary Agent has completed a turn containing "E2E_PRIMARY_SENTINEL: prepare release notes for the helper."
    When the user asks Advisor "Review the primary transcript and send a Hint if useful."
    Then Advisor should deliver a Hint through Steer
    And the delivered Advice should include "primary_transcript=seen"
