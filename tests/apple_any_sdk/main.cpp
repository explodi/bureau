// Links what a game links, and loads it: no bundle runs, so a first frame with nothing
// in it says that Bureau and Hermes both arrived.
#include "bureau/ui.h"

int main() {
  bureau::Ui ui{bureau::Ui::Options{}};
  return ui.takeFrame().list == nullptr ? 0 : 1;
}
