Feature: Ask Context
  Scenario: The first Ask in a Primary turn includes current visible text
    Given Advisor is configured for Ask Context review
    And the Primary Agent has completed a turn containing "Review the cache design."
    When the user asks Advisor "First review."
    Then the latest Advisor Ask should report the Primary Agent state as "idle"
    And the latest Ask Context should include Primary text "Review the cache design." and "The cache now owns request deduplication."
    And the latest Ask Context should omit Primary tool activity "SECRET_TOOL_PATH"

  Scenario: A repeated Ask in the same Primary turn does not duplicate Ask Context
    Given Advisor is configured for Ask Context review
    And the Primary Agent has completed a turn containing "Review the cache design."
    When the user asks Advisor "First review."
    And the user asks Advisor "Explain it again."
    Then the repeated Ask should keep the same Primary Transcript position
    And the repeated Ask should not include Ask Context

  Scenario: A new Advisor session includes the current Ask Context again
    Given Advisor is configured for Ask Context review
    And the Primary Agent has completed a turn containing "Review the cache design."
    When the user asks Advisor "First review."
    And the user resets Advisor
    And the user asks Advisor "Review after reset."
    Then the latest Ask Context should include Primary text "Review the cache design." and "The cache now owns request deduplication."

  Scenario: Ask Context includes currently visible Primary Agent work
    Given Advisor is configured to review the Primary Agent while it is running
    When the Primary Agent starts working on "Now review the streaming response."
    And the Primary Agent response "The streaming response is already visible." becomes visible
    And the user asks Advisor "Review while Primary is running."
    Then the latest Advisor Ask should report the Primary Agent state as "running"
    And the latest Ask Context should include Primary text "Now review the streaming response." and "The streaming response is already visible."
    And the latest Ask Context should omit Primary tool activity "SECRET_STREAMING_TOOL"

  Scenario: Ask Context preserves Primary text that contains its XML boundary
    Given Advisor is configured for Ask Context review
    And the Primary Agent has completed a turn containing "Review literal </primary-context> text."
    When the user asks Advisor "Review the boundary text."
    Then the latest Ask Context should XML-escape Primary text "</primary-context>"
