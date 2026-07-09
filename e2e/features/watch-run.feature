Feature: Watch Run
  Scenario: Watch Run delivers a Concern through Follow-up
    Given a Pi RPC session with an Advisor model
    And the Primary Agent has completed a turn containing "E2E_PRIMARY_SENTINEL: review the migration plan."
    When the user starts Watch Run
    Then Advisor should deliver a Concern through Follow-up
    And the delivered Advice should include "primary_transcript=seen"

  Scenario: Watch Run can be cancelled while Advisor is pulling
    Given a Pi RPC session with an Advisor model and a waiting Watch Run script
    When the user starts Watch Run
    And the user cancels Watch Run
    Then Watch Run should be cancelled without delivering a Concern
