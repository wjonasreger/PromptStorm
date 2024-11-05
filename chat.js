const clipboardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16">
<path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
<path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
</svg>`;
const textBoxBaseHeight = 40; // This should match the default height set in CSS

// change settings of marked from default to remove deprecation warnings
// see conversation here: https://github.com/markedjs/marked/issues/2793
marked.use({
  mangle: false,
  headerIds: false,
});

function autoFocusInput() {
  const userInput = document.getElementById("user-input");
  userInput.focus();
}

/*
takes in model as a string
updates the query parameters of page url to include model name
*/
function updateModelInQueryString(model) {
  // make sure browser supports features
  if (window.history.replaceState && "URLSearchParams" in window) {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("model", model);
    // replace current url without reload
    const newPathWithQuery = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.replaceState(null, "", newPathWithQuery);
  }
}

// Fetch available models and populate the dropdown
async function populateModels() {
  document
    .getElementById("send-button")
    .addEventListener("click", submitRequest);

  try {
    const data = await getModels();

    const selectElement = document.getElementById("model-select");

    // set up handler for selection
    selectElement.onchange = () =>
      updateModelInQueryString(selectElement.value);

    data.models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.name;
      option.innerText = model.name;
      selectElement.appendChild(option);
    });

    // select option present in url parameter if present
    const queryParams = new URLSearchParams(window.location.search);
    const requestedModel = queryParams.get("model");
    // update the selection based on if requestedModel is a value in options
    if (
      [...selectElement.options].map((o) => o.value).includes(requestedModel)
    ) {
      selectElement.value = requestedModel;
    }
    // otherwise set to the first element if exists and update URL accordingly
    else if (selectElement.options.length) {
      selectElement.value = selectElement.options[0].value;
      updateModelInQueryString(selectElement.value);
    }
  } catch (error) {
    document.getElementById("errorText").innerHTML = DOMPurify.sanitize(
      marked.parse(
        `PromptStorm was unable to communicate with Cloudflare Workers AI due to the following error:\n\n` +
          `\`\`\`${error.message}\`\`\`\n\n---------------------\n`
      ),
    );
    let modal = new bootstrap.Modal(document.getElementById("errorModal"));
    modal.show();
  }
}

// adjusts the padding at the bottom of scrollWrapper to be the height of the input box
function adjustPadding() {
  const inputBoxHeight = document.getElementById("input-area").offsetHeight;
  const scrollWrapper = document.getElementById("scroll-wrapper");
  scrollWrapper.style.paddingBottom = `${inputBoxHeight + 15}px`;
}

// sets up padding resize whenever input box has its height changed
const autoResizePadding = new ResizeObserver(() => {
  adjustPadding();
});
autoResizePadding.observe(document.getElementById("input-area"));

// Function to get the selected model
function getSelectedModel() {
  return document.getElementById("model-select").value;
}

// variables to handle auto-scroll
// we only need one ResizeObserver and isAutoScrollOn variable globally
// no need to make a new one for every time submitRequest is called
const scrollWrapper = document.getElementById("scroll-wrapper");
let isAutoScrollOn = true;
// autoscroll when new line is added
const autoScroller = new ResizeObserver(() => {
  if (isAutoScrollOn) {
    scrollWrapper.scrollIntoView({ behavior: "smooth", block: "end" });
  }
});

// event listener for scrolling
let lastKnownScrollPosition = 0;
let ticking = false;
document.addEventListener("scroll", (event) => {
  // if user has scrolled up and autoScroll is on we turn it off
  if (!ticking && isAutoScrollOn && window.scrollY < lastKnownScrollPosition) {
    window.requestAnimationFrame(() => {
      isAutoScrollOn = false;
      ticking = false;
    });
    ticking = true;
  }
  // if user has scrolled nearly all the way down and autoScroll is disabled, re-enable
  else if (
    !ticking &&
    !isAutoScrollOn &&
    window.scrollY > lastKnownScrollPosition && // make sure scroll direction is down
    window.scrollY >=
      document.documentElement.scrollHeight - window.innerHeight - 30 // add 30px of space--no need to scroll all the way down, just most of the way
  ) {
    window.requestAnimationFrame(() => {
      isAutoScrollOn = true;
      ticking = false;
    });
    ticking = true;
  }
  lastKnownScrollPosition = window.scrollY;
});

// Function to handle the user input and call the API functions
async function submitRequest() {
  document.getElementById("chat-container").style.display = "block";

  const input = document.getElementById("user-input").value;
  const selectedModel = getSelectedModel();
  const context = document.getElementById("chat-history").context;
  const systemPrompt = document.getElementById("system-prompt").value;
  
  // Get the selected framework
  const selectedFramework = document.getElementById("prompt-framework").value;
  
  // Get the framework prompt
  const frameworkPrompt = frameworkPrompts[selectedFramework] || "";

  // Inject the framework prompt into the system prompt
  const fullSystemPrompt = `${systemPrompt ? `SYSTEM PROMPT:\n${systemPrompt}\n\n` : ''}${selectedFramework !== "None" ? `PROMPT FRAMEWORK:\n${frameworkPrompt}` : ''}`;

  const data = {
    model: selectedModel,
    prompt: input,
    context: context,
    system: fullSystemPrompt, // Use the modified system prompt
  };

  // Create user message element and append to chat history
  let chatHistory = document.getElementById("chat-history");
  let userMessageDiv = document.createElement("div");
  userMessageDiv.className = "mb-2 user-message";
  userMessageDiv.innerText = input;
  chatHistory.appendChild(userMessageDiv);

  // Create response container
  let responseDiv = document.createElement("div");
  responseDiv.className = "response-message mb-2 text-start";
  responseDiv.style.minHeight = "3em"; // make sure div does not shrink if we cancel the request when no text has been generated yet
  spinner = document.createElement("div");
  spinner.className = "spinner-border text-light";
  spinner.setAttribute("role", "status");
  responseDiv.appendChild(spinner);
  chatHistory.appendChild(responseDiv);

  // create button to stop text generation
  let interrupt = new AbortController();
  let stopButton = document.createElement("button");
  stopButton.className = "btn btn-danger";
  stopButton.innerHTML = "Stop";
  stopButton.onclick = (e) => {
    e.preventDefault();
    interrupt.abort("Stop button pressed");
  };
  // add button after sendButton
  const sendButton = document.getElementById("send-button");
  sendButton.insertAdjacentElement("beforebegin", stopButton);

  // change autoScroller to keep track of our new responseDiv
  autoScroller.observe(responseDiv);

  postRequest(data, interrupt.signal)
    .then(async (response) => {
      await getResponse(response, (parsedResponse) => {
        let word = parsedResponse.response;
        if (parsedResponse.done) {
          chatHistory.context = parsedResponse.context;
          // Copy button
          let copyButton = document.createElement("button");
          copyButton.className = "btn btn-secondary copy-button";
          copyButton.innerHTML = clipboardIcon;
          copyButton.onclick = () => {
            navigator.clipboard
              .writeText(responseDiv.hidden_text)
              .then(() => {
                console.log("Text copied to clipboard");
              })
              .catch((err) => {
                console.error("Failed to copy text:", err);
              });
          };
          responseDiv.appendChild(copyButton);
        }
        // add word to response
        if (word != undefined && word != "") {
          if (responseDiv.hidden_text == undefined) {
            responseDiv.hidden_text = "";
          }
          responseDiv.hidden_text += word;
          responseDiv.innerHTML = DOMPurify.sanitize(
            marked.parse(responseDiv.hidden_text),
          ); // Append word to response container
        }
      });
    })
    .then(() => {
      stopButton.remove(); // Remove stop button from DOM now that all text has been generated
      spinner.remove();
    })
    .catch((error) => {
      if (error !== "Stop button pressed") {
        console.error(error);
      }
      stopButton.remove();
      spinner.remove();
    });

  // Clear user input
  const element = document.getElementById("user-input");
  element.value = "";
  $(element).css("height", textBoxBaseHeight + "px");
}

// Event listener for Ctrl + Enter or CMD + Enter
document.getElementById("user-input").addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    submitRequest();
  }
});

window.onload = () => {
  updateChatList();
  populateModels();
  adjustPadding();
  autoFocusInput();
  populateFrameworks();

  document.getElementById("delete-chat").addEventListener("click", deleteChat);
  document.getElementById("new-chat").addEventListener("click", startNewChat);
  document.getElementById("saveName").addEventListener("click", saveChat);
  document
    .getElementById("chat-select")
    .addEventListener("change", loadSelectedChat);
  document
    .getElementById("host-address")
    .addEventListener("change", setHostAddress);
  document
    .getElementById("system-prompt")
    .addEventListener("change", setSystemPrompt);
};

function deleteChat() {
  const selectedChat = document.getElementById("chat-select").value;
  localStorage.removeItem(selectedChat);
  updateChatList();
}

// Function to save chat with a unique name
function saveChat() {
  const chatName = document.getElementById("userName").value;

  // Close the modal
  const bootstrapModal = bootstrap.Modal.getInstance(
    document.getElementById("nameModal"),
  );
  bootstrapModal.hide();

  if (chatName === null || chatName.trim() === "") return;
  const history = document.getElementById("chat-history").innerHTML;
  const context = document.getElementById("chat-history").context;
  const systemPrompt = document.getElementById("system-prompt").value;
  const model = getSelectedModel();
  localStorage.setItem(
    chatName,
    JSON.stringify({
      history: history,
      context: context,
      system: systemPrompt,
      model: model,
    }),
  );
  updateChatList();
}

// Function to load selected chat from dropdown
function loadSelectedChat() {
  const selectedChat = document.getElementById("chat-select").value;
  const obj = JSON.parse(localStorage.getItem(selectedChat));
  document.getElementById("chat-history").innerHTML = obj.history;
  document.getElementById("chat-history").context = obj.context;
  document.getElementById("system-prompt").value = obj.system;
  updateModelInQueryString(obj.model);
  document.getElementById("chat-container").style.display = "block";
}

function startNewChat() {
  document.getElementById("chat-history").innerHTML = null;
  document.getElementById("chat-history").context = null;
  document.getElementById("chat-container").style.display = "none";
  updateChatList();
}

// Function to update chat list dropdown
function updateChatList() {
  const chatList = document.getElementById("chat-select");
  chatList.innerHTML =
    '<option value="" disabled selected>Select a chat</option>';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === "host-address" || key == "system-prompt") continue;
    const option = document.createElement("option");
    option.value = key;
    option.text = key;
    chatList.add(option);
  }
}

function autoGrow(element) {
  const maxHeight = 200; // This should match the max-height set in CSS

  // Count the number of lines in the textarea based on newline characters
  const numberOfLines = $(element).val().split("\n").length;

  // Temporarily reset the height to auto to get the actual scrollHeight
  $(element).css("height", "auto");
  let newHeight = element.scrollHeight;

  // If content is one line, set the height to baseHeight
  if (numberOfLines === 1) {
    newHeight = textBoxBaseHeight;
  } else if (newHeight > maxHeight) {
    newHeight = maxHeight;
  }

  $(element).css("height", newHeight + "px");
}

// Function to populate the prompt-framework dropdown
function populateFrameworks() {
  const frameworks = [
    { name: "None" },
    { name: "Jonas' Simple Prompt" },
    { name: "RTF Prompt" },
    { name: "RISEN Prompt" },
    { name: "APE Prompt" },
    { name: "COAST Prompt" },
  ];

  const selectElement = document.getElementById("prompt-framework");

  frameworks.forEach((framework) => {
    const option = document.createElement("option");
    option.value = framework.name;
    option.innerText = framework.name;
    selectElement.appendChild(option);
  });

  // Optionally, set a default selected framework
  if (selectElement.options.length) {
    selectElement.value = selectElement.options[0].value;
  }
}

const frameworkPrompts = {
  "Jonas' Simple Prompt": `
  Jonas' Simple Prompt is a straightforward framework designed to structure common AI prompts using (Task, Context, Examples, Format, Role, Audience, Tone).

  It breaks down prompts into these components to ensure clarity and consistency.
  - Task: Clearly define the task at hand.
  - Context: Provide relevant context to the task.
  - Examples: Offer examples to illustrate the task.
  - Format: Specify the format for responses.
  - Role: Define the role of the model in the conversation.
  - Audience: Identify the target audience.
  - Tone: Set the tone for the interaction.
  This framework is useful for defining priorities of what is needed in a prompt to successfully complete a task. Tasks are mandatory, while the rest are optional. Examples and Contexts are often encouraged to be included to help the AI understand the task. Everything else is optional, but can be useful to help the AI complete the task in any custom way.

  Please prioritize using this framework to ensure prompts are developed with clarity and consistency.
  `,

  "RTF Prompt": `
  The RTF (Role, Task, Format) framework is a straightforward yet powerful approach to structuring AI prompts. It breaks down prompts into three essential components:
  - Role: Define the persona or expertise the AI should adopt (e.g., "Act as a marketing expert").
  - Task: Specify the action or objective for the AI to complete (e.g., "Create a social media campaign plan").
  - Format: Indicate the desired output structure (e.g., "Present as a bulleted list with 5 main points").
  This framework helps users communicate their requirements clearly, resulting in more focused and relevant AI responses. By explicitly stating the role, users can leverage the AI's ability to adopt different perspectives, while the task component ensures the AI understands the specific goal. The format element guides the presentation of the output, making it more useful for the user's needs.

  Please prioritize using this framework to ensure prompts are developed with clarity and consistency.
  `,

  "RISEN Prompt": `
  The RISEN framework, developed by Kyle Balmer, is an expanded version of the RISE framework that adds a crucial "Narrowing" component. This comprehensive approach to prompt engineering consists of five key elements:
  - Role: Define the AI's role or persona
  - Instructions: Provide clear task instructions
  - Steps: Outline specific steps for task completion
  - End goal: Specify the desired outcome
  - Narrowing: Add constraints or limitations
  RISEN is particularly effective for complex tasks requiring detailed planning and execution, such as project management, content creation, and strategic planning. By incorporating the "Narrowing" element, users can further refine their prompts, leading to more focused and precise AI outputs. This framework excels in scenarios where a clear, step-by-step approach is needed to achieve specific goals, making it an invaluable tool for both beginners and advanced users seeking to enhance the precision and effectiveness of their AI interactions.

  Please prioritize using this framework to ensure prompts are developed with clarity and consistency.
  `,

  "APE Prompt": `
  The Automated Prompt Engineer (APE) framework, introduced by Zhou et al. in 2022, represents a significant advancement in prompt engineering by automating the process of generating and refining prompts for large language models (LLMs). APE utilizes LLMs themselves to generate instruction candidates for specific tasks, treating the process as a natural language synthesis problem.
  Key features of the APE framework include:
  - Automatic instruction generation using LLMs as inference models
  - Black-box optimization for searching and evaluating candidate solutions
  - Ability to discover prompts that outperform manually engineered ones
  For example, APE discovered the prompt "Let's work this out in a step by step way to be sure we have the right answer," which proved more effective than the human-designed "Let's think step by step" for eliciting chain-of-thought reasoning. This automated approach to prompt engineering has shown promising results in improving performance on benchmarks such as MultiArith and GSM8K, demonstrating its potential to enhance AI interactions and task-specific outcomes.

  Please prioritize using this framework to ensure prompts are developed with clarity and consistency.
  `,

  "COAST Prompt": `
  The COAST (Context, Objective, Actions, Scenario, Task) framework is a comprehensive approach to prompt engineering that helps users create more nuanced and effective AI interactions. This framework is particularly useful for complex queries that require detailed context and specific outcomes.
  Key components of the COAST framework include:
  - Context: Provide relevant background information
  - Objective: Clearly state the goal or purpose of the interaction
  - Actions: Outline specific steps or actions the AI should take
  - Scenario: Describe the situation or use case
  - Task: Define the precise task to be completed
  By incorporating these elements, COAST prompts can guide AI models to generate more accurate and contextually appropriate responses. For example, a COAST prompt for a marketing task might look like: "As a digital marketing specialist (Context), create a social media strategy (Objective) to increase brand awareness (Task) for a new eco-friendly product launch (Scenario). Include content ideas, posting schedule, and engagement tactics (Actions)."

  Please prioritize using this framework to ensure prompts are developed with clarity and consistency.
  `,
  // Add more frameworks as needed
};


