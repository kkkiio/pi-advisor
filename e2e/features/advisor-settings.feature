Feature: Advisor Settings
  Scenario: Ask Advisor needs a configured model before producing a Second Opinion
    Given Advisor has no configured model
    When the user asks Advisor "Please review the current task."
    Then the user should be warned that the Advisor model is not set

  Scenario: User model and thinking commands persist Advisor preferences
    Given Advisor has no configured model
    When the user selects a registered Advisor model
    And the user sets Advisor thinking to "high"
    Then Advisor preferences should persist the selected model and thinking "high"

  Scenario: User preference commands open interactive pickers
    Given Advisor has no configured model
    When the user opens the Advisor model preference
    Then Advisor should offer registered Advisor models
    When the user opens the Advisor thinking preference
    Then Advisor should offer thinking levels with default "medium"

  Scenario: User model and thinking pickers persist Advisor preferences
    Given Advisor has no configured model
    When the user chooses a registered Advisor model from the Advisor model picker
    And the user chooses Advisor thinking "high" from the Advisor thinking picker
    Then Advisor preferences should persist the selected model and thinking "high"

  Scenario: Invalid Advisor preference commands report validation errors
    Given Advisor has no configured model
    When the user enters an invalid Advisor model format
    Then Advisor should warn with "Use /advisor:model <provider/model>."
    When the user selects an unavailable Advisor model
    Then Advisor should report that the selected model is unavailable
    When the user selects an unsupported Advisor thinking level
    Then Advisor should warn with "Use /advisor:thinking off|minimal|low|medium|high|xhigh."

  @interactive
  Scenario: User navigates and searches the Advisor model picker
    Given Advisor has no configured model in the interactive terminal
    When the user opens the Advisor model picker in the terminal
    Then the user can move to another Advisor model
    When the user searches the Advisor model picker for "faux-advisor"
    Then the matching Advisor model should become selected
    When the user confirms the filtered Advisor model
    Then the Advisor model preference should be "advisor-e2e/faux-advisor"
