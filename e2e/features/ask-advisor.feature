Feature: Ask Advisor
  Scenario: Ask Advisor without a message reports usage
    Given Advisor has a configured model
    When the user asks Advisor without a message
    Then Advisor should warn with "Usage: /advisor <message>"

  Scenario: Ask Advisor pulls Primary Transcript View, then delivers a Hint through Steer
    Given Advisor has a configured model
    And the Primary Agent has recent work for Advisor to review
    When the user asks Advisor "Review the primary transcript and send a Hint if useful."
    Then Advisor should deliver a Hint through Steer
    And the Advice should be based on the Primary Agent's recent work
