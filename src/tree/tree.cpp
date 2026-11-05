#include "tree.h"

#include <algorithm>
#include <cstddef>
#include <utility>

namespace bureau {
namespace {

enum class Op : int32_t {
  Create = 1,
  Text = 2,
  Append = 3,
  Insert = 4,
  Remove = 5,
  Props = 6,
  Destroy = 7,
};

size_t argumentCount(Op op) {
  if (op == Op::Insert) return 3;
  if (op == Op::Destroy) return 1;
  return 2;
}

}  // namespace

const Node* Tree::node(int32_t id) const {
  const auto found = nodes_.find(id);
  return found == nodes_.end() ? nullptr : &found->second;
}

std::vector<int32_t>* Tree::children(int32_t parent) {
  if (parent == 0) return &roots_;
  const auto found = nodes_.find(parent);
  return found == nodes_.end() ? nullptr : &found->second.children;
}

void Tree::clear() {
  nodes_.clear();
  roots_.clear();
  revision_ += 1;
}

bool Tree::apply(const int32_t* operations, size_t count,
                 const std::vector<std::string>& strings) {
  if (operations == nullptr && count != 0) return false;
  revision_ += 1;
  for (size_t index = 0; index < count;) {
    const auto op = static_cast<Op>(operations[index++]);
    if (op < Op::Create || op > Op::Destroy) return false;
    const size_t arguments = argumentCount(op);
    if (count - index < arguments) return false;
    const int32_t first = operations[index++];
    const int32_t second = arguments > 1 ? operations[index++] : 0;
    const int32_t third = arguments > 2 ? operations[index++] : 0;

    if (op == Op::Create || op == Op::Text || op == Op::Props) {
      if (second < 0 || static_cast<size_t>(second) >= strings.size()) {
        return false;
      }
    }
    if (op == Op::Create) {
      if (first <= 0 || nodes_.contains(first)) return false;
      Node created;
      created.type = strings[second];
      created.serial = ++serials_;
      nodes_.emplace(first, std::move(created));
      continue;
    }
    if (op == Op::Text) {
      if (first <= 0) return false;
      const auto existing = nodes_.find(first);
      if (existing != nodes_.end() && existing->second.type != "#text") {
        return false;
      }
      const bool fresh = existing == nodes_.end();
      auto& target = nodes_[first];
      if (fresh) target.serial = ++serials_;
      target.type = "#text";
      target.text = strings[second];
      continue;
    }
    if (op == Op::Props) {
      auto found = nodes_.find(first);
      if (found == nodes_.end()) return false;
      const auto patch = nlohmann::json::parse(strings[second], nullptr, false);
      if (!patch.is_object()) return false;
      for (auto entry = patch.begin(); entry != patch.end(); ++entry) {
        if (entry.value().is_null()) found->second.props.erase(entry.key());
        else found->second.props[entry.key()] = entry.value();
      }
      continue;
    }
    if (op == Op::Destroy) {
      if (nodes_.erase(first) != 1) return false;
      continue;
    }

    auto* siblings = children(first);
    if (siblings == nullptr || !nodes_.contains(second)) return false;
    auto old = std::find(siblings->begin(), siblings->end(), second);
    const bool wasChild = old != siblings->end();
    if (old != siblings->end()) siblings->erase(old);
    Node& child = nodes_.find(second)->second;
    if (op == Op::Append) {
      siblings->push_back(second);
      child.parent = first;
    } else if (op == Op::Insert) {
      const auto before = std::find(siblings->begin(), siblings->end(), third);
      if (before == siblings->end()) return false;
      siblings->insert(before, second);
      child.parent = first;
    } else if (op == Op::Remove) {
      if (!wasChild) return false;
      child.parent = -1;
    }
  }
  return true;
}

}  // namespace bureau
