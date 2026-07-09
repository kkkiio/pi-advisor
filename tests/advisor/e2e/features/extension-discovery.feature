Feature: Extension Discovery
  Scenario: Advisor commands are registered in a real Pi RPC session
    Given a fresh Pi RPC session
    Then Advisor commands should be registered
