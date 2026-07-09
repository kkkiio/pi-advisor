Feature: Ask Advisor
  Scenario: Ask Advisor without a message reports usage
    Given Advisor has a configured model
    When the user asks Advisor without a message
    Then Advisor should warn with "Usage: /advisor <message>"

  Scenario: Ask Advisor pulls Primary Transcript View, then hands off the latest Second Opinion
    Given Advisor has a configured model
    And the Primary Agent has recent work for Advisor to review
    When the user asks Advisor "Review the primary transcript."
    And the user hands off the latest Advisor Second Opinion with "Please verify and apply this if it is real."
    Then Primary Agent should receive the latest Advisor Second Opinion handoff
