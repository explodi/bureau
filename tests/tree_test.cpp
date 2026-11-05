#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

#include "tree.h"

TEST_CASE("a literal stream builds the native node table") {
  bureau::Tree tree;
  const int32_t operations[] = {
      1, 1, 0, 6, 1, 1, 2, 2, 2, 3, 1, 2, 3, 0, 1,
  };
  const std::vector<std::string> strings = {
      "bureau-box", R"({"fill":"db32-black","onPress":true})", "Cash"};

  REQUIRE(tree.apply(operations, std::size(operations), strings));
  REQUIRE(tree.roots() == std::vector<int32_t>{1});
  REQUIRE(tree.node(1) != nullptr);
  CHECK(tree.node(1)->type == "bureau-box");
  CHECK(tree.node(1)->props["fill"] == "db32-black");
  CHECK(tree.node(1)->props["onPress"] == true);
  CHECK(tree.node(1)->children == std::vector<int32_t>{2});
  REQUIRE(tree.node(2) != nullptr);
  CHECK(tree.node(2)->text == "Cash");
}

TEST_CASE("a props patch changes only named values") {
  bureau::Tree tree;
  const int32_t first[] = {1, 1, 0, 6, 1, 1};
  const std::vector<std::string> initial = {
      "bureau-box", R"({"fill":"db32-black","grow":1})"};
  REQUIRE(tree.apply(first, std::size(first), initial));

  const int32_t update[] = {6, 1, 0};
  REQUIRE(tree.apply(update, std::size(update),
                     {R"({"fill":"db32-white"})"}));
  CHECK(tree.node(1)->props ==
        nlohmann::json{{"fill", "db32-white"}, {"grow", 1}});
}

TEST_CASE("text changes in place and removed ids can be reused") {
  bureau::Tree tree;
  const int32_t first[] = {2, 1, 0, 3, 0, 1};
  REQUIRE(tree.apply(first, std::size(first), {"Cash"}));
  const int32_t update[] = {2, 1, 0};
  REQUIRE(tree.apply(update, std::size(update), {"Debt"}));
  CHECK(tree.node(1)->text == "Debt");

  const int32_t replace[] = {5, 0, 1, 7, 1, 1, 1, 0, 3, 0, 1};
  REQUIRE(tree.apply(replace, std::size(replace), {"bureau-box"}));
  CHECK(tree.node(1)->type == "bureau-box");
  CHECK(tree.roots() == std::vector<int32_t>{1});
}
