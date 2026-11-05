#ifndef BUREAU_TREE_TREE_H
#define BUREAU_TREE_TREE_H

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include <nlohmann/json.hpp>

namespace bureau {

struct Node {
  std::string type;
  std::string text;
  nlohmann::json props = nlohmann::json::object();
  std::vector<int32_t> children;
  /** 0 for a root, -1 while detached. */
  int32_t parent = -1;
  /** Counts up with every node created: a Layer's place among the layers,
   * in the order they mounted. */
  uint64_t serial = 0;
};

class Tree {
 public:
  bool apply(const int32_t* operations, size_t count,
             const std::vector<std::string>& strings);
  const Node* node(int32_t id) const;
  const std::vector<int32_t>& roots() const { return roots_; }
  /** Bumped by every change applied. */
  uint64_t revision() const { return revision_; }
  void clear();

 private:
  std::vector<int32_t>* children(int32_t parent);
  std::unordered_map<int32_t, Node> nodes_;
  std::vector<int32_t> roots_;
  uint64_t revision_ = 0;
  uint64_t serials_ = 0;
};

}  // namespace bureau

#endif
