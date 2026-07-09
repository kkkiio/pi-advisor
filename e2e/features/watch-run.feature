Feature: Watch Run
  Scenario: Watch Run delivers a Concern through Follow-up
    Given Advisor has a configured model
    And the Primary Agent has recent work for Advisor to review
    When the user starts Watch Run
    Then Advisor should deliver a Concern through Follow-up
    And the Advice should be based on the Primary Agent's recent work

  Scenario: Watch Run can be cancelled while Advisor is pulling
    Given Advisor is configured and Watch Run can wait for Primary Agent progress
    When the user starts Watch Run
    And the user cancels Watch Run
    Then Watch Run should be cancelled without delivering a Concern
